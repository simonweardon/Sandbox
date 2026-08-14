#include "FacilityBuilder.h"

#include "ShardPickup.h"
#include "SlidingDoor.h"
#include "VaultTerminal.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	/** Every /Engine/BasicShapes mesh is 100 units across, so halves divide by 50. */
	constexpr float MeshHalfSize = 50.f;

	const FLinearColor FloorColour   (0.085f, 0.095f, 0.115f);
	const FLinearColor WallColour    (0.170f, 0.180f, 0.210f);
	const FLinearColor CeilingColour (0.065f, 0.070f, 0.085f);
	const FLinearColor TrimColour    (0.020f, 0.330f, 0.430f);
	const FLinearColor PedestalColour(0.130f, 0.140f, 0.170f);
	const FLinearColor CrateColour   (0.210f, 0.160f, 0.105f);
	const FLinearColor MetalColour   (0.230f, 0.245f, 0.275f);
	const FLinearColor PipeColour    (0.145f, 0.150f, 0.165f);
	const FLinearColor DiffuserColour(0.900f, 0.880f, 0.820f);

	const FLinearColor LampWarm(1.f, 0.90f, 0.74f);
	const FLinearColor LampCool(0.62f, 0.80f, 1.f);
}

AFacilityBuilder::AFacilityBuilder()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Movable);
	RootComponent = Root;

	// All four ship with the engine, so none of this needs importing.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> ConeFinder(TEXT("/Engine/BasicShapes/Cone.Cone"));

	if (CubeFinder.Succeeded())     { CubeMesh = CubeFinder.Object; }
	if (CylinderFinder.Succeeded()) { CylinderMesh = CylinderFinder.Object; }
	if (SphereFinder.Succeeded())   { SphereMesh = SphereFinder.Object; }
	if (ConeFinder.Succeeded())     { ConeMesh = ConeFinder.Object; }
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

UStaticMeshComponent* AFacilityBuilder::AddShape(
	UStaticMesh* Mesh,
	const FVector& Centre,
	const FVector& LocalScale,
	const FRotator& Rotation,
	const FLinearColor& Colour,
	bool bCollides)
{
	if (!Mesh)
	{
		return nullptr;
	}

	UStaticMeshComponent* Shape = NewObject<UStaticMeshComponent>(this);
	Shape->SetupAttachment(RootComponent);
	Shape->SetStaticMesh(Mesh);

	// Mobility has to be set before registration, otherwise moving it afterwards
	// trips the "static component moved" warning.
	Shape->SetMobility(EComponentMobility::Movable);
	Shape->RegisterComponent();

	Shape->SetWorldLocationAndRotation(Centre, Rotation);
	Shape->SetWorldScale3D(LocalScale);

	// Decoration is left non-colliding so it never traps the player or steals
	// the interaction trace from something behind it.
	Shape->SetCollisionProfileName(bCollides ? TEXT("BlockAll") : TEXT("NoCollision"));

	if (UMaterialInstanceDynamic* Material = Shape->CreateAndSetMaterialInstanceDynamic(0))
	{
		Material->SetVectorParameterValue(TEXT("Color"), Colour);
	}

	BuiltComponents.Add(Shape);
	return Shape;
}

UStaticMeshComponent* AFacilityBuilder::AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour, bool bCollides)
{
	return AddShape(CubeMesh, Centre, HalfExtent / MeshHalfSize, FRotator::ZeroRotator, Colour, bCollides);
}

UStaticMeshComponent* AFacilityBuilder::AddPillar(const FVector& Centre, float Radius, float HalfHeight, const FLinearColor& Colour, bool bCollides)
{
	const FVector Scale(Radius / MeshHalfSize, Radius / MeshHalfSize, HalfHeight / MeshHalfSize);
	return AddShape(CylinderMesh, Centre, Scale, FRotator::ZeroRotator, Colour, bCollides);
}

UStaticMeshComponent* AFacilityBuilder::AddPipe(const FVector& Start, const FVector& End, float Radius, const FLinearColor& Colour, bool bCollides)
{
	const FVector Along = End - Start;
	const float Length = Along.Size();
	if (Length < KINDA_SMALL_NUMBER)
	{
		return nullptr;
	}

	// The cylinder's long axis is its local Z, so aim that down the run.
	const FRotator Rotation = FRotationMatrix::MakeFromZ(Along / Length).Rotator();
	const FVector Scale(Radius / MeshHalfSize, Radius / MeshHalfSize, (Length * 0.5f) / MeshHalfSize);

	return AddShape(CylinderMesh, Start + Along * 0.5f, Scale, Rotation, Colour, bCollides);
}

UStaticMeshComponent* AFacilityBuilder::AddSphere(const FVector& Centre, float Radius, const FLinearColor& Colour, bool bCollides)
{
	const FVector Scale(FVector(Radius / MeshHalfSize));
	return AddShape(SphereMesh, Centre, Scale, FRotator::ZeroRotator, Colour, bCollides);
}

void AFacilityBuilder::AddLight(const FVector& Location, const FLinearColor& Colour, float Intensity, float Radius)
{
	UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
	Light->SetupAttachment(RootComponent);
	Light->SetMobility(EComponentMobility::Movable);
	Light->RegisterComponent();

	Light->SetWorldLocation(Location);
	Light->SetIntensityUnits(ELightUnits::Unitless);
	Light->SetIntensity(Intensity);
	Light->SetAttenuationRadius(Radius);
	Light->SetLightColor(Colour);
	Light->SetCastShadows(true);

	BuiltComponents.Add(Light);
}

void AFacilityBuilder::AddCeilingFixture(const FVector& CeilingPoint, const FLinearColor& Colour, float Intensity, float Radius)
{
	// Housing bolted to the ceiling, a pale plate below it, and the light itself
	// just under the plate. A bare point light in mid air reads as a bug.
	AddBox(CeilingPoint + FVector(0.f, 0.f, -8.f), FVector(46.f, 46.f, 8.f), MetalColour, false);
	AddBox(CeilingPoint + FVector(0.f, 0.f, -18.f), FVector(38.f, 38.f, 3.f), DiffuserColour, false);
	AddLight(CeilingPoint + FVector(0.f, 0.f, -28.f), Colour, Intensity, Radius);
}

void AFacilityBuilder::AddKeyLight()
{
	UDirectionalLightComponent* Sun = NewObject<UDirectionalLightComponent>(this);
	Sun->SetupAttachment(RootComponent);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->RegisterComponent();

	Sun->SetWorldRotation(FRotator(-52.f, 35.f, 0.f));
	Sun->SetIntensity(0.6f);
	Sun->SetLightColor(FLinearColor(0.55f, 0.62f, 0.85f));

	BuiltComponents.Add(Sun);
}

// ---------------------------------------------------------------------------
// composite props
// ---------------------------------------------------------------------------

void AFacilityBuilder::AddColumn(float X, float Y, float Height, float Radius)
{
	AddPillar(FVector(X, Y, Height * 0.5f), Radius, Height * 0.5f, MetalColour);

	// Collars at floor and ceiling, so the column meets both with a joint
	// rather than just intersecting them.
	AddPillar(FVector(X, Y, 14.f), Radius * 1.28f, 14.f, PedestalColour, false);
	AddPillar(FVector(X, Y, Height - 14.f), Radius * 1.28f, 14.f, PedestalColour, false);
}

void AFacilityBuilder::AddPipeRun(const FVector& Start, const FVector& End, float Radius, int32 CollarCount)
{
	AddPipe(Start, End, Radius, PipeColour);

	if (CollarCount <= 0)
	{
		return;
	}

	const FVector Along = End - Start;
	const float Length = Along.Size();
	if (Length < KINDA_SMALL_NUMBER)
	{
		return;
	}

	const FRotator Rotation = FRotationMatrix::MakeFromZ(Along / Length).Rotator();
	const FVector CollarScale(
		(Radius * 1.45f) / MeshHalfSize,
		(Radius * 1.45f) / MeshHalfSize,
		9.f / MeshHalfSize);

	for (int32 Index = 0; Index < CollarCount; ++Index)
	{
		const float T = (Index + 0.5f) / CollarCount;
		AddShape(CylinderMesh, Start + Along * T, CollarScale, Rotation, MetalColour, false);
	}
}

void AFacilityBuilder::AddRailing(const FVector& Start, const FVector& End, float Height, int32 PostCount)
{
	const FVector Along = End - Start;

	AddPipe(Start + FVector(0.f, 0.f, Height), End + FVector(0.f, 0.f, Height), 5.f, MetalColour);
	AddPipe(Start + FVector(0.f, 0.f, Height * 0.55f), End + FVector(0.f, 0.f, Height * 0.55f), 3.5f, MetalColour);

	for (int32 Index = 0; Index < PostCount; ++Index)
	{
		const float T = PostCount > 1 ? static_cast<float>(Index) / (PostCount - 1) : 0.5f;
		const FVector Foot = Start + Along * T;
		AddPillar(Foot + FVector(0.f, 0.f, Height * 0.5f), 5.f, Height * 0.5f, MetalColour, false);
	}
}

void AFacilityBuilder::AddWallSeams(const FVector& Start, const FVector& End, float Height, int32 Count)
{
	const FVector Along = End - Start;

	for (int32 Index = 0; Index < Count; ++Index)
	{
		const float T = (Index + 0.5f) / Count;
		const FVector At = Start + Along * T;

		// Thin proud strip; which axis it is thin on depends on the wall's run.
		const bool bRunsAlongX = FMath::Abs(Along.X) > FMath::Abs(Along.Y);
		const FVector Half = bRunsAlongX
			? FVector(7.f, 5.f, Height * 0.5f)
			: FVector(5.f, 7.f, Height * 0.5f);

		AddBox(FVector(At.X, At.Y, Height * 0.5f), Half, CeilingColour, false);
	}
}

// ---------------------------------------------------------------------------
// rooms
// ---------------------------------------------------------------------------

void AFacilityBuilder::Build()
{
	if (!CubeMesh)
	{
		UE_LOG(LogTemp, Error, TEXT("Vantage: /Engine/BasicShapes/Cube.Cube not found; level will be empty."));
		return;
	}

	if (!CylinderMesh || !SphereMesh || !ConeMesh)
	{
		// Not fatal: every helper that needs one returns null and the room is
		// simply plainer. Worth knowing about, though.
		UE_LOG(LogTemp, Warning,
			TEXT("Vantage: some /Engine/BasicShapes meshes are missing; detail props will be skipped."));
	}

	AddKeyLight();
	BuildAtrium();
	BuildCorridor();
	BuildVault();
	BuildFurnishings();
}

// Interior spans X -700..700, Y -700..700, floor 0 to ceiling 450.
// The player enters here. The way out is a gap in the east wall at Y -180..180.
void AFacilityBuilder::BuildAtrium()
{
	AddBox(FVector(0.f, 0.f, -25.f), FVector(720.f, 720.f, 25.f), FloorColour);
	AddBox(FVector(0.f, 0.f, 470.f), FVector(720.f, 720.f, 20.f), CeilingColour);

	AddBox(FVector(-720.f, 0.f, 225.f), FVector(20.f, 720.f, 225.f), WallColour);
	AddBox(FVector(0.f, 720.f, 225.f),  FVector(700.f, 20.f, 225.f), WallColour);
	AddBox(FVector(0.f, -720.f, 225.f), FVector(700.f, 20.f, 225.f), WallColour);

	// East wall, split around the corridor mouth.
	AddBox(FVector(720.f, 450.f, 225.f),  FVector(20.f, 270.f, 225.f), WallColour);
	AddBox(FVector(720.f, -450.f, 225.f), FVector(20.f, 270.f, 225.f), WallColour);
	AddBox(FVector(720.f, 0.f, 375.f),    FVector(20.f, 180.f, 75.f),  WallColour);

	AddWallSeams(FVector(-700.f, 700.f, 0.f), FVector(700.f, 700.f, 0.f), 450.f, 6);
	AddWallSeams(FVector(-700.f, -700.f, 0.f), FVector(700.f, -700.f, 0.f), 450.f, 6);
	AddWallSeams(FVector(-700.f, -700.f, 0.f), FVector(-700.f, 700.f, 0.f), 450.f, 6);

	// Lit trim at the base of the walls, so the room reads even with the
	// flashlight off and gives the eye a line to follow toward the exit.
	AddBox(FVector(-700.f, 0.f, 8.f), FVector(6.f, 700.f, 8.f), TrimColour, false);
	AddBox(FVector(0.f, 700.f, 8.f),  FVector(700.f, 6.f, 8.f), TrimColour, false);
	AddBox(FVector(0.f, -700.f, 8.f), FVector(700.f, 6.f, 8.f), TrimColour, false);

	AddColumn(-540.f, -540.f, 450.f, 52.f);
	AddColumn(-540.f, 540.f, 450.f, 52.f);
	AddColumn(540.f, 540.f, 450.f, 52.f);

	AddPipeRun(FVector(-700.f, 330.f, 408.f), FVector(700.f, 330.f, 408.f), 17.f, 5);
	AddPipeRun(FVector(-700.f, 372.f, 400.f), FVector(700.f, 372.f, 400.f), 11.f, 5);
	AddPipeRun(FVector(-700.f, -350.f, 408.f), FVector(700.f, -350.f, 408.f), 17.f, 5);

	// Elbow down the east wall, so the pipe run visibly goes somewhere.
	AddPipeRun(FVector(690.f, 330.f, 408.f), FVector(690.f, 330.f, 120.f), 17.f, 2);

	AddCeilingFixture(FVector(0.f, 0.f, 450.f), LampWarm, 14000.f, 2200.f);
	AddCeilingFixture(FVector(-450.f, 450.f, 450.f), LampCool, 5000.f, 1400.f);
	AddCeilingFixture(FVector(450.f, -450.f, 450.f), LampCool, 5000.f, 1400.f);
}

// A deliberately tight, low run between the two rooms: X 700..1900, Y -180..180,
// ceiling at 300. The squeeze is what makes the vault feel large.
void AFacilityBuilder::BuildCorridor()
{
	AddBox(FVector(1300.f, 0.f, -25.f), FVector(620.f, 200.f, 25.f), FloorColour);
	AddBox(FVector(1300.f, 0.f, 320.f), FVector(620.f, 200.f, 20.f), CeilingColour);

	AddBox(FVector(1300.f, 200.f, 150.f),  FVector(600.f, 20.f, 150.f), WallColour);
	AddBox(FVector(1300.f, -200.f, 150.f), FVector(600.f, 20.f, 150.f), WallColour);

	AddBox(FVector(1300.f, 180.f, 8.f),  FVector(600.f, 6.f, 8.f), TrimColour, false);
	AddBox(FVector(1300.f, -180.f, 8.f), FVector(600.f, 6.f, 8.f), TrimColour, false);

	// Ribs, to give the walk down the corridor some rhythm.
	for (int32 Index = 0; Index < 5; ++Index)
	{
		const float X = 820.f + Index * 240.f;
		AddBox(FVector(X, 190.f, 150.f),  FVector(14.f, 12.f, 150.f), CeilingColour, false);
		AddBox(FVector(X, -190.f, 150.f), FVector(14.f, 12.f, 150.f), CeilingColour, false);
		AddBox(FVector(X, 0.f, 296.f),    FVector(14.f, 190.f, 10.f), CeilingColour, false);
	}

	// Floor plates, crossing the walk direction so they tick past underfoot.
	for (int32 Index = 0; Index < 9; ++Index)
	{
		AddBox(FVector(760.f + Index * 130.f, 0.f, 2.f), FVector(6.f, 178.f, 3.f), MetalColour, false);
	}

	AddPipeRun(FVector(700.f, 138.f, 268.f), FVector(1900.f, 138.f, 268.f), 15.f, 6);
	AddPipeRun(FVector(700.f, 168.f, 262.f), FVector(1900.f, 168.f, 262.f), 9.f, 6);
	AddPipeRun(FVector(700.f, -150.f, 268.f), FVector(1900.f, -150.f, 268.f), 12.f, 6);

	AddCeilingFixture(FVector(940.f, 0.f, 300.f), LampWarm, 3200.f, 900.f);
	AddCeilingFixture(FVector(1420.f, 0.f, 300.f), LampWarm, 3200.f, 900.f);
	AddCeilingFixture(FVector(1820.f, 0.f, 300.f), LampCool, 2600.f, 900.f);
}

// Interior spans X 1900..3400, Y -900..900, ceiling at 550. Entered through the
// blast door in the west wall.
void AFacilityBuilder::BuildVault()
{
	AddBox(FVector(2650.f, 0.f, -25.f), FVector(770.f, 920.f, 25.f), FloorColour);
	AddBox(FVector(2650.f, 0.f, 570.f), FVector(770.f, 920.f, 20.f), CeilingColour);

	// West wall, split around the doorway at Y -180..180, height 300.
	AddBox(FVector(1900.f, 550.f, 275.f),  FVector(20.f, 370.f, 275.f), WallColour);
	AddBox(FVector(1900.f, -550.f, 275.f), FVector(20.f, 370.f, 275.f), WallColour);
	AddBox(FVector(1900.f, 0.f, 425.f),    FVector(20.f, 180.f, 125.f), WallColour);

	AddBox(FVector(3420.f, 0.f, 275.f),   FVector(20.f, 920.f, 275.f), WallColour);
	AddBox(FVector(2650.f, 920.f, 275.f), FVector(750.f, 20.f, 275.f), WallColour);
	AddBox(FVector(2650.f, -920.f, 275.f), FVector(750.f, 20.f, 275.f), WallColour);

	AddWallSeams(FVector(1900.f, 900.f, 0.f), FVector(3400.f, 900.f, 0.f), 550.f, 7);
	AddWallSeams(FVector(1900.f, -900.f, 0.f), FVector(3400.f, -900.f, 0.f), 550.f, 7);

	AddBox(FVector(2650.f, 900.f, 8.f),  FVector(750.f, 6.f, 8.f), TrimColour, false);
	AddBox(FVector(2650.f, -900.f, 8.f), FVector(750.f, 6.f, 8.f), TrimColour, false);
	AddBox(FVector(3400.f, 0.f, 8.f),    FVector(6.f, 900.f, 8.f), TrimColour, false);

	// Doorway surround, so the blast door sits in a frame rather than a hole.
	AddBox(FVector(1930.f, 195.f, 155.f), FVector(26.f, 22.f, 160.f), MetalColour, false);
	AddBox(FVector(1930.f, -195.f, 155.f), FVector(26.f, 22.f, 160.f), MetalColour, false);
	AddBox(FVector(1930.f, 0.f, 312.f), FVector(26.f, 218.f, 20.f), MetalColour, false);

	AddColumn(2320.f, -660.f, 550.f, 62.f);
	AddColumn(2320.f, 660.f, 550.f, 62.f);
	AddColumn(2720.f, -660.f, 550.f, 62.f);
	AddColumn(2720.f, 660.f, 550.f, 62.f);

	AddPipeRun(FVector(1920.f, 780.f, 505.f), FVector(3400.f, 780.f, 505.f), 20.f, 6);
	AddPipeRun(FVector(1920.f, 820.f, 496.f), FVector(3400.f, 820.f, 496.f), 13.f, 6);
	AddPipeRun(FVector(1920.f, -800.f, 505.f), FVector(3400.f, -800.f, 505.f), 20.f, 6);

	// Two steps up to the terminal dais at the far end.
	AddBox(FVector(3120.f, 0.f, 20.f), FVector(300.f, 420.f, 20.f), PedestalColour);
	AddBox(FVector(3160.f, 0.f, 55.f), FVector(260.f, 360.f, 20.f), PedestalColour);

	// Railings flanking the dais, leaving the middle open to walk up.
	AddRailing(FVector(2900.f, 300.f, 75.f), FVector(2900.f, 360.f, 75.f), 95.f, 2);
	AddRailing(FVector(2900.f, -360.f, 75.f), FVector(2900.f, -300.f, 75.f), 95.f, 2);
	AddRailing(FVector(2900.f, 360.f, 75.f), FVector(3420.f, 360.f, 75.f), 95.f, 6);
	AddRailing(FVector(2900.f, -360.f, 75.f), FVector(3420.f, -360.f, 75.f), 95.f, 6);

	AddCeilingFixture(FVector(2300.f, -420.f, 550.f), LampCool, 7000.f, 1800.f);
	AddCeilingFixture(FVector(2300.f, 420.f, 550.f), LampCool, 7000.f, 1800.f);
	AddCeilingFixture(FVector(3050.f, 0.f, 550.f), LampWarm, 9000.f, 2000.f);
}

void AFacilityBuilder::BuildFurnishings()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// Three shards, each on its own plinth. Two are in plain sight in the atrium;
	// the third is tucked against the corridor wall so it has to be looked for.
	struct FShardSite
	{
		FVector Base;
		float PlinthHalf;
		float PlinthHeight;
	};

	const FShardSite ShardSites[] = {
		{ FVector(-420.f, -430.f, 0.f), 55.f, 45.f },
		{ FVector(430.f, 400.f, 0.f),   55.f, 45.f },
		{ FVector(1450.f, -105.f, 0.f), 45.f, 38.f }
	};

	for (const FShardSite& Site : ShardSites)
	{
		// Tapered plinth: wider base, narrower neck, capped with a plate.
		AddBox(Site.Base + FVector(0.f, 0.f, 12.f),
			FVector(Site.PlinthHalf * 1.2f, Site.PlinthHalf * 1.2f, 12.f), PedestalColour);
		AddPillar(Site.Base + FVector(0.f, 0.f, Site.PlinthHeight),
			Site.PlinthHalf * 0.78f, Site.PlinthHeight, PedestalColour);
		AddBox(Site.Base + FVector(0.f, 0.f, Site.PlinthHeight * 2.f - 6.f),
			FVector(Site.PlinthHalf, Site.PlinthHalf, 6.f), MetalColour);

		World->SpawnActor<AShardPickup>(
			Site.Base + FVector(0.f, 0.f, Site.PlinthHeight * 2.f + 55.f),
			FRotator::ZeroRotator,
			SpawnParams);
	}

	// The blast door sits on the vault side of the west wall, so the halves have
	// somewhere to park when they slide apart.
	World->SpawnActor<ASlidingDoor>(FVector(1935.f, 0.f, 0.f), FRotator::ZeroRotator, SpawnParams);

	World->SpawnActor<AVaultTerminal>(FVector(3160.f, 0.f, 75.f), FRotator(0.f, 180.f, 0.f), SpawnParams);

	// Scattered crates and barrels. Hand placed rather than randomised so the
	// silhouettes stay readable and nothing ever spawns blocking the corridor.
	const FVector Crates[] = {
		FVector(-560.f, 520.f, 0.f),
		FVector(-450.f, 590.f, 0.f),
		FVector(-560.f, 400.f, 0.f),
		FVector(560.f, -540.f, 0.f),
		FVector(2150.f, 700.f, 0.f),
		FVector(2280.f, 760.f, 0.f),
		FVector(2150.f, -720.f, 0.f),
		FVector(2600.f, -640.f, 0.f)
	};

	const int32 CrateCount = UE_ARRAY_COUNT(Crates);
	for (int32 Index = 0; Index < CrateCount; ++Index)
	{
		const float Half = 55.f + (Index % 3) * 12.f;
		AddBox(Crates[Index] + FVector(0.f, 0.f, Half), FVector(Half, Half, Half), CrateColour);

		// Banding, so a crate is not one flat cube.
		AddBox(Crates[Index] + FVector(0.f, 0.f, Half * 0.55f),
			FVector(Half * 1.03f, Half * 1.03f, 5.f), MetalColour, false);
		AddBox(Crates[Index] + FVector(0.f, 0.f, Half * 1.45f),
			FVector(Half * 1.03f, Half * 1.03f, 5.f), MetalColour, false);

		if (Index % 3 == 0)
		{
			AddBox(Crates[Index] + FVector(12.f, -8.f, Half * 2.f + 35.f),
				FVector(35.f, 35.f, 35.f), CrateColour);
		}
	}

	// Barrels, for silhouettes the crates cannot give.
	const FVector Barrels[] = {
		FVector(-300.f, 620.f, 0.f),
		FVector(-230.f, 570.f, 0.f),
		FVector(620.f, 180.f, 0.f),
		FVector(2450.f, 780.f, 0.f),
		FVector(2520.f, 720.f, 0.f),
		FVector(2000.f, -780.f, 0.f)
	};

	const int32 BarrelCount = UE_ARRAY_COUNT(Barrels);
	for (int32 Index = 0; Index < BarrelCount; ++Index)
	{
		const FLinearColor Colour = (Index % 2 == 0) ? CrateColour : MetalColour;
		AddPillar(Barrels[Index] + FVector(0.f, 0.f, 58.f), 34.f, 58.f, Colour);
		AddPillar(Barrels[Index] + FVector(0.f, 0.f, 22.f), 36.f, 5.f, MetalColour, false);
		AddPillar(Barrels[Index] + FVector(0.f, 0.f, 94.f), 36.f, 5.f, MetalColour, false);
	}
}
