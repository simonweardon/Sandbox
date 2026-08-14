#include "DesertBuilder.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	/** Every /Engine/BasicShapes mesh is 100 units across, so halves divide by 50. */
	constexpr float MeshHalfSize = 50.f;

	const FLinearColor SandColour     (0.560f, 0.440f, 0.290f);
	const FLinearColor SandDarkColour (0.410f, 0.310f, 0.195f);
	const FLinearColor ConcreteColour (0.415f, 0.420f, 0.430f);
	const FLinearColor ConcreteDark   (0.235f, 0.240f, 0.250f);
	const FLinearColor GlassColour    (0.055f, 0.075f, 0.095f);
	const FLinearColor RustColour     (0.330f, 0.170f, 0.095f);
	const FLinearColor SteelColour    (0.230f, 0.235f, 0.250f);
	const FLinearColor DistantColour  (0.310f, 0.315f, 0.335f);
}

ADesertBuilder::ADesertBuilder()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Movable);
	RootComponent = Root;

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

UStaticMeshComponent* ADesertBuilder::AddShape(
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
	Shape->SetMobility(EComponentMobility::Movable);
	Shape->RegisterComponent();

	Shape->SetWorldLocationAndRotation(Centre, Rotation);
	Shape->SetWorldScale3D(LocalScale);
	Shape->SetCollisionProfileName(bCollides ? TEXT("BlockAll") : TEXT("NoCollision"));

	if (UMaterialInstanceDynamic* Material = Shape->CreateAndSetMaterialInstanceDynamic(0))
	{
		// Every surface gets a small deterministic shade offset keyed off where
		// it sits. Without it a wall of identically tinted boxes reads as one
		// flat sheet; with it the panelling and blockwork start to show.
		const FIntVector Cell(
			FMath::FloorToInt(Centre.X / 12.f),
			FMath::FloorToInt(Centre.Y / 12.f),
			FMath::FloorToInt(Centre.Z / 12.f));

		FRandomStream Jitter(static_cast<int32>(GetTypeHash(Cell)));
		const float Shade = Jitter.FRandRange(0.84f, 1.16f);

		FLinearColor Weathered = Colour * Shade;
		Weathered.A = 1.f;
		Material->SetVectorParameterValue(TEXT("Color"), Weathered);
	}

	BuiltComponents.Add(Shape);
	return Shape;
}

UStaticMeshComponent* ADesertBuilder::AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour, bool bCollides)
{
	return AddShape(CubeMesh, Centre, HalfExtent / MeshHalfSize, FRotator::ZeroRotator, Colour, bCollides);
}

UStaticMeshComponent* ADesertBuilder::AddRotatedBox(const FVector& Centre, const FVector& HalfExtent, const FRotator& Rotation, const FLinearColor& Colour, bool bCollides)
{
	return AddShape(CubeMesh, Centre, HalfExtent / MeshHalfSize, Rotation, Colour, bCollides);
}

UStaticMeshComponent* ADesertBuilder::AddSphere(const FVector& Centre, float Radius, const FLinearColor& Colour, bool bCollides)
{
	return AddShape(SphereMesh, Centre, FVector(Radius / MeshHalfSize), FRotator::ZeroRotator, Colour, bCollides);
}

UStaticMeshComponent* ADesertBuilder::AddPillar(const FVector& Centre, float Radius, float HalfHeight, const FLinearColor& Colour, bool bCollides)
{
	const FVector Scale(Radius / MeshHalfSize, Radius / MeshHalfSize, HalfHeight / MeshHalfSize);
	return AddShape(CylinderMesh, Centre, Scale, FRotator::ZeroRotator, Colour, bCollides);
}

void ADesertBuilder::AddLight(const FVector& Location, const FLinearColor& Colour, float Intensity, float Radius)
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

// ---------------------------------------------------------------------------
// sky and ground
// ---------------------------------------------------------------------------

void ADesertBuilder::BuildSky()
{
	// All four are components on this actor rather than placed actors: light and
	// sky actors default to Stationary mobility, which cannot be positioned at
	// runtime without complaint. Components let us set Movable before register.

	UDirectionalLightComponent* Sun = NewObject<UDirectionalLightComponent>(this);
	Sun->SetupAttachment(RootComponent);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->RegisterComponent();
	// Low and raking, which is what gives the ruins their long shadows.
	Sun->SetWorldRotation(FRotator(-17.f, 125.f, 0.f));
	Sun->SetIntensity(8.f);
	Sun->SetLightColor(FLinearColor(1.f, 0.82f, 0.60f));
	BuiltComponents.Add(Sun);

	USkyAtmosphereComponent* Atmosphere = NewObject<USkyAtmosphereComponent>(this);
	Atmosphere->SetupAttachment(RootComponent);
	Atmosphere->SetMobility(EComponentMobility::Movable);
	Atmosphere->RegisterComponent();
	BuiltComponents.Add(Atmosphere);

	// Real-time capture means the sky lights the scene without a baked cubemap,
	// which matters because nothing here can be baked.
	USkyLightComponent* SkyLight = NewObject<USkyLightComponent>(this);
	SkyLight->SetupAttachment(RootComponent);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->bRealTimeCapture = true;
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->RegisterComponent();
	SkyLight->SetIntensity(1.1f);
	BuiltComponents.Add(SkyLight);

	// Haze does the real work here: it hides the edge of the ground plane and
	// separates the tower ring from the skyline behind it.
	UExponentialHeightFogComponent* Fog = NewObject<UExponentialHeightFogComponent>(this);
	Fog->SetupAttachment(RootComponent);
	Fog->SetMobility(EComponentMobility::Movable);
	Fog->RegisterComponent();
	Fog->SetFogDensity(0.008f);
	Fog->SetFogHeightFalloff(0.12f);
	Fog->SetFogInscatteringColor(FLinearColor(0.72f, 0.58f, 0.42f));
	Fog->SetStartDistance(1200.f);
	BuiltComponents.Add(Fog);
}

void ADesertBuilder::BuildGround()
{
	AddBox(FVector(0.f, 0.f, -120.f), FVector(15000.f, 15000.f, 120.f), SandColour);

	// Broad, very flat patches breaking up the colour so the floor is not one
	// unshaded sheet. Non-colliding and slightly proud of the ground.
	FRandomStream Stream(20240814);
	for (int32 Index = 0; Index < 26; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(400.f, 6500.f);
		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			2.f);

		const float Size = Stream.FRandRange(300.f, 1100.f);
		AddRotatedBox(
			At,
			FVector(Size, Size * Stream.FRandRange(0.5f, 1.f), 2.f),
			FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f),
			SandDarkColour,
			false);
	}
}

void ADesertBuilder::AddDunes()
{
	FRandomStream Stream(99118);

	for (int32 Index = 0; Index < 14; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(7000.f, 12500.f);
		const float Radius = Stream.FRandRange(900.f, 2400.f);

		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			-Radius * Stream.FRandRange(0.45f, 0.7f));

		// A part-buried sphere reads as a dune far more cheaply than a mesh.
		AddShape(
			SphereMesh,
			At,
			FVector(Radius / MeshHalfSize, Radius / MeshHalfSize, (Radius * 0.55f) / MeshHalfSize),
			FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f),
			SandDarkColour,
			false);
	}
}

// ---------------------------------------------------------------------------
// the city
// ---------------------------------------------------------------------------

void ADesertBuilder::AddRuinedTower(const FVector& Base, float Width, float Depth, float Height, int32 Seed)
{
	FRandomStream Stream(Seed);

	const float HalfW = Width * 0.5f;
	const float HalfD = Depth * 0.5f;

	// The intact lower portion. Everything above it is broken away.
	const float ShaftTop = Height * Stream.FRandRange(0.55f, 0.82f);
	AddBox(Base + FVector(0.f, 0.f, ShaftTop * 0.5f), FVector(HalfW, HalfD, ShaftTop * 0.5f), ConcreteColour);

	// Glazing: one dark inset panel per face reads as a window grid at a
	// fraction of the component count of actual windows.
	const float GlazeHeight = ShaftTop * 0.44f;
	const float GlazeZ = Base.Z + ShaftTop * 0.5f;
	AddBox(FVector(Base.X + HalfW + 3.f, Base.Y, GlazeZ), FVector(3.f, HalfD * 0.82f, GlazeHeight), GlassColour, false);
	AddBox(FVector(Base.X - HalfW - 3.f, Base.Y, GlazeZ), FVector(3.f, HalfD * 0.82f, GlazeHeight), GlassColour, false);
	AddBox(FVector(Base.X, Base.Y + HalfD + 3.f, GlazeZ), FVector(HalfW * 0.82f, 3.f, GlazeHeight), GlassColour, false);
	AddBox(FVector(Base.X, Base.Y - HalfD - 3.f, GlazeZ), FVector(HalfW * 0.82f, 3.f, GlazeHeight), GlassColour, false);

	// Floor bands wrapping the shaft, which is what gives a tower its scale.
	const int32 BandCount = FMath::Clamp(FMath::RoundToInt(ShaftTop / 420.f), 2, 7);
	for (int32 Index = 1; Index <= BandCount; ++Index)
	{
		const float Z = Base.Z + (ShaftTop * Index) / (BandCount + 1);
		AddBox(FVector(Base.X, Base.Y, Z), FVector(HalfW * 1.05f, HalfD * 1.05f, 11.f), ConcreteDark, false);
	}

	// Broken crown: progressively smaller, progressively more offset blocks.
	float CrownZ = Base.Z + ShaftTop;
	float CrownW = HalfW;
	float CrownD = HalfD;
	const int32 CrownPieces = Stream.RandRange(2, 4);

	for (int32 Index = 0; Index < CrownPieces; ++Index)
	{
		const float PieceHeight = Stream.FRandRange(90.f, 260.f);
		CrownW *= Stream.FRandRange(0.55f, 0.88f);
		CrownD *= Stream.FRandRange(0.55f, 0.88f);

		const FVector Offset(
			Stream.FRandRange(-HalfW * 0.35f, HalfW * 0.35f),
			Stream.FRandRange(-HalfD * 0.35f, HalfD * 0.35f),
			PieceHeight * 0.5f);

		AddBox(FVector(Base.X, Base.Y, CrownZ) + Offset, FVector(CrownW, CrownD, PieceHeight * 0.5f), ConcreteColour);
		CrownZ += PieceHeight;
	}

	// Floor slabs left hanging where the facade tore off.
	const int32 SlabCount = Stream.RandRange(1, 3);
	for (int32 Index = 0; Index < SlabCount; ++Index)
	{
		const float Z = Base.Z + ShaftTop * Stream.FRandRange(0.62f, 0.98f);
		const bool bAlongX = Stream.FRand() > 0.5f;
		const float Reach = Stream.FRandRange(HalfW * 0.5f, HalfW * 1.3f);
		const float Side = Stream.FRand() > 0.5f ? 1.f : -1.f;

		const FVector Centre = bAlongX
			? FVector(Base.X + Side * (HalfW + Reach * 0.5f), Base.Y, Z)
			: FVector(Base.X, Base.Y + Side * (HalfD + Reach * 0.5f), Z);

		const FVector Half = bAlongX
			? FVector(Reach * 0.5f, HalfD * 0.75f, 13.f)
			: FVector(HalfW * 0.75f, Reach * 0.5f, 13.f);

		AddRotatedBox(Centre, Half, FRotator(Stream.FRandRange(-7.f, 7.f), 0.f, Stream.FRandRange(-5.f, 5.f)), ConcreteDark);

		// Exposed reinforcement, hanging off the broken edge.
		AddPillar(Centre + FVector(0.f, 0.f, -26.f), 4.f, 26.f, RustColour, false);
	}

	// Rubble skirt. Non-colliding so it never snags the player or the zombies.
	const int32 RubbleCount = Stream.RandRange(5, 9);
	for (int32 Index = 0; Index < RubbleCount; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = FMath::Max(HalfW, HalfD) * Stream.FRandRange(1.05f, 1.9f);
		const float Size = Stream.FRandRange(40.f, 130.f);

		const FVector At = Base + FVector(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			Size * 0.35f);

		AddRotatedBox(
			At,
			FVector(Size, Size * Stream.FRandRange(0.6f, 1.2f), Size * 0.45f),
			FRotator(Stream.FRandRange(-25.f, 25.f), Stream.FRandRange(0.f, 360.f), Stream.FRandRange(-25.f, 25.f)),
			ConcreteDark,
			false);
	}
}

void ADesertBuilder::BuildCity()
{
	FRandomStream Stream(770231);

	// A ring of ruins, with the gaps between them left open so the arena reads
	// as a place you could be flanked from rather than a walled room.
	const int32 TowerCount = 15;
	for (int32 Index = 0; Index < TowerCount; ++Index)
	{
		const float Angle = (360.f / TowerCount) * Index + Stream.FRandRange(-9.f, 9.f);
		const float Distance = Stream.FRandRange(2700.f, 6200.f);

		const FVector Base(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			0.f);

		// Keep clear of the vault ruin, which is placed by hand at (0, 4600).
		// A tower landing on top of it would seal the doorway.
		if (FVector::DistSquared2D(Base, FVector(0.f, 4600.f, 0.f)) < FMath::Square(1500.f))
		{
			continue;
		}

		const float Width = Stream.FRandRange(300.f, 620.f);
		const float Depth = Stream.FRandRange(300.f, 620.f);
		const float Height = Stream.FRandRange(1400.f, 4200.f);

		AddRuinedTower(Base, Width, Depth, Height, Stream.RandRange(1, 1000000));
	}

	// Two collapsed towers lying across the sand, for a silhouette the standing
	// ones cannot give.
	AddRotatedBox(FVector(-2100.f, 1500.f, 210.f), FVector(1500.f, 240.f, 210.f), FRotator(0.f, 34.f, 6.f), ConcreteColour);
	AddRotatedBox(FVector(1850.f, -2250.f, 180.f), FVector(1200.f, 200.f, 180.f), FRotator(0.f, -58.f, -4.f), ConcreteColour);
}

void ADesertBuilder::AddDistantSkyline()
{
	FRandomStream Stream(4410902);

	// Flat dark blocks, no detail and no collision. At this distance and through
	// the fog they only ever read as silhouettes.
	for (int32 Index = 0; Index < 26; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(8500.f, 13000.f);
		const float Height = Stream.FRandRange(1800.f, 6000.f);
		const float Width = Stream.FRandRange(300.f, 900.f);

		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			Height * 0.5f);

		AddRotatedBox(
			At,
			FVector(Width, Width * Stream.FRandRange(0.6f, 1.4f), Height * 0.5f),
			FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f),
			DistantColour,
			false);
	}
}

void ADesertBuilder::BuildCover()
{
	FRandomStream Stream(5150);

	// Broken walls at chest height, scattered inside the arena. These are what
	// make backing away from a horde a decision rather than a straight line.
	for (int32 Index = 0; Index < 16; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(700.f, 2700.f);
		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			0.f);

		const float Length = Stream.FRandRange(180.f, 520.f);
		const float WallHeight = Stream.FRandRange(90.f, 220.f);
		const FRotator Facing(0.f, Stream.FRandRange(0.f, 360.f), 0.f);

		AddRotatedBox(At + FVector(0.f, 0.f, WallHeight * 0.5f), FVector(Length, 26.f, WallHeight * 0.5f), Facing, ConcreteColour);

		// A lower stub alongside, so the wall looks broken rather than built.
		AddRotatedBox(
			At + Facing.RotateVector(FVector(Length + 90.f, 0.f, 0.f)) + FVector(0.f, 0.f, WallHeight * 0.28f),
			FVector(80.f, 26.f, WallHeight * 0.28f),
			Facing,
			ConcreteDark);
	}

	// Wrecked cars: body, cabin, and four flat wheels.
	for (int32 Index = 0; Index < 7; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(800.f, 2900.f);
		const FRotator Facing(0.f, Stream.FRandRange(0.f, 360.f), 0.f);
		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			0.f);

		const FLinearColor Paint = (Index % 2 == 0) ? RustColour : SteelColour;

		AddRotatedBox(At + FVector(0.f, 0.f, 58.f), FVector(215.f, 92.f, 34.f), Facing, Paint);
		AddRotatedBox(At + Facing.RotateVector(FVector(-30.f, 0.f, 0.f)) + FVector(0.f, 0.f, 112.f),
			FVector(95.f, 84.f, 30.f), Facing, Paint);

		for (int32 Wheel = 0; Wheel < 4; ++Wheel)
		{
			const float WheelX = (Wheel < 2) ? 145.f : -145.f;
			const float WheelY = (Wheel % 2 == 0) ? 88.f : -88.f;
			AddShape(
				CylinderMesh,
				At + Facing.RotateVector(FVector(WheelX, WheelY, 0.f)) + FVector(0.f, 0.f, 26.f),
				FVector(26.f / MeshHalfSize, 26.f / MeshHalfSize, 14.f / MeshHalfSize),
				Facing + FRotator(0.f, 0.f, 90.f),
				ConcreteDark,
				false);
		}
	}

	// Barrels and boulders, for silhouette variety at ankle to waist height.
	for (int32 Index = 0; Index < 22; ++Index)
	{
		const float Angle = Stream.FRandRange(0.f, 360.f);
		const float Distance = Stream.FRandRange(500.f, 3000.f);
		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
			0.f);

		if (Index % 3 == 0)
		{
			const float Radius = Stream.FRandRange(55.f, 120.f);
			AddSphere(At + FVector(0.f, 0.f, Radius * 0.62f), Radius, SandDarkColour);
		}
		else
		{
			AddPillar(At + FVector(0.f, 0.f, 58.f), 32.f, 58.f, RustColour);
			AddPillar(At + FVector(0.f, 0.f, 22.f), 34.f, 5.f, ConcreteDark, false);
			AddPillar(At + FVector(0.f, 0.f, 94.f), 34.f, 5.f, ConcreteDark, false);
		}
	}
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

// Placed due north and well past the ring the horde spawns on, so the walk to
// it goes straight through them rather than around.
const FVector ADesertBuilder::CacheLocation(0.f, 4860.f, 380.f);
const FVector ADesertBuilder::LockLocation(0.f, 4700.f, 380.f);
const FVector ADesertBuilder::PlaqueLocation(-450.f, 4480.f, 150.f);
const FVector ADesertBuilder::VaultDoorLocation(0.f, 4180.f, 0.f);
const FVector ADesertBuilder::ExtractionLocation(0.f, 0.f, 0.f);

void ADesertBuilder::BuildVaultRuin()
{
	const float BaseY = 4600.f;
	const float WallHalf = 25.f;

	// --- ground floor: a hollow room with a doorway on the south face -------
	const float RoomHeight = 340.f;

	AddBox(FVector(-300.f, 4250.f, RoomHeight * 0.5f), FVector(175.f, WallHalf, RoomHeight * 0.5f), ConcreteColour);
	AddBox(FVector(300.f, 4250.f, RoomHeight * 0.5f),  FVector(175.f, WallHalf, RoomHeight * 0.5f), ConcreteColour);
	AddBox(FVector(0.f, 4250.f, 320.f), FVector(125.f, WallHalf, 20.f), ConcreteColour);

	AddBox(FVector(0.f, 4950.f, RoomHeight * 0.5f),   FVector(475.f, WallHalf, RoomHeight * 0.5f), ConcreteColour);
	AddBox(FVector(-475.f, BaseY, RoomHeight * 0.5f), FVector(WallHalf, 375.f, RoomHeight * 0.5f), ConcreteColour);
	AddBox(FVector(475.f, BaseY, RoomHeight * 0.5f),  FVector(WallHalf, 375.f, RoomHeight * 0.5f), ConcreteColour);

	AddBox(FVector(0.f, BaseY, 5.f), FVector(475.f, 375.f, 5.f), ConcreteDark, false);

	// Doorway surround, lit, so the entrance reads from across the sand.
	AddBox(FVector(-137.f, 4250.f, 150.f), FVector(12.f, 30.f, 150.f), SteelColour, false);
	AddBox(FVector(137.f, 4250.f, 150.f),  FVector(12.f, 30.f, 150.f), SteelColour, false);
	AddBox(FVector(0.f, 4250.f, 296.f),    FVector(137.f, 30.f, 10.f), SteelColour, false);

	AddLight(FVector(0.f, 4180.f, 250.f), FLinearColor(0.35f, 0.85f, 1.f), 5000.f, 900.f);
	AddLight(FVector(-220.f, 4450.f, 300.f), FLinearColor(1.f, 0.86f, 0.68f), 2800.f, 850.f);

	// --- the plaque carrying this run\'s combination -------------------------
	// Set into the west wall where the torch beam catches it on the way in.
	AddBox(PlaqueLocation + FVector(14.f, 0.f, 0.f), FVector(4.f, 78.f, 52.f), SteelColour, false);
	AddBox(PlaqueLocation + FVector(19.f, 0.f, 0.f), FVector(2.f, 68.f, 42.f), ConcreteDark, false);
	AddLight(PlaqueLocation + FVector(90.f, 0.f, 60.f), FLinearColor(1.f, 0.92f, 0.75f), 1500.f, 460.f);

	// --- staircase up the east side -----------------------------------------
	// Seventeen 22cm treads. Each is a solid block from the floor rather than a
	// floating slab, so there is nothing to fall through underneath.
	const int32 StepCount = 17;
	const float StepRise = 380.f / StepCount;
	const float StepTread = 31.f;
	const float StairStartY = 4350.f;

	for (int32 Index = 0; Index < StepCount; ++Index)
	{
		const float TopZ = (Index + 1) * StepRise;
		AddBox(
			FVector(340.f, StairStartY + Index * StepTread + StepTread * 0.5f, TopZ * 0.5f),
			FVector(90.f, StepTread * 0.5f, TopZ * 0.5f),
			ConcreteDark);
	}

	// Handrail alongside the flight, so the climb reads as a stair not a ramp.
	for (int32 Index = 0; Index < 5; ++Index)
	{
		const float T = Index / 4.f;
		AddBox(
			FVector(246.f, StairStartY + T * (StepCount * StepTread), 380.f * T + 55.f),
			FVector(5.f, 5.f, 55.f),
			SteelColour, false);
	}

	AddLight(FVector(300.f, 4600.f, 300.f), FLinearColor(1.f, 0.86f, 0.68f), 2400.f, 800.f);

	// --- first floor slab, with the stairwell left open ---------------------
	// Four pieces around a hole at X 240..440, Y 4760..4940.
	AddBox(FVector(-130.f, BaseY, 360.f), FVector(370.f, 400.f, 20.f), ConcreteDark);
	AddBox(FVector(470.f, BaseY, 360.f),  FVector(30.f, 400.f, 20.f),  ConcreteDark);
	AddBox(FVector(340.f, 4480.f, 360.f), FVector(100.f, 280.f, 20.f), ConcreteDark);
	AddBox(FVector(340.f, 4970.f, 360.f), FVector(100.f, 30.f, 20.f),  ConcreteDark);

	// A lip around the opening, so you can see where the floor stops.
	AddBox(FVector(235.f, 4850.f, 392.f), FVector(6.f, 90.f, 12.f), SteelColour, false);
	AddBox(FVector(340.f, 4755.f, 392.f), FVector(100.f, 6.f, 12.f), SteelColour, false);

	// --- first floor room ---------------------------------------------------
	const float UpperMid = 550.f;
	const float UpperHalf = 170.f;

	AddBox(FVector(0.f, 4250.f, UpperMid),  FVector(475.f, WallHalf, UpperHalf), ConcreteColour);
	AddBox(FVector(0.f, 4950.f, UpperMid),  FVector(475.f, WallHalf, UpperHalf), ConcreteColour);
	AddBox(FVector(-475.f, BaseY, UpperMid), FVector(WallHalf, 375.f, UpperHalf), ConcreteColour);
	AddBox(FVector(475.f, BaseY, UpperMid),  FVector(WallHalf, 375.f, UpperHalf), ConcreteColour);
	AddBox(FVector(0.f, BaseY, 740.f), FVector(500.f, 400.f, 20.f), ConcreteDark);

	// A blown-out section of the south wall, so the room is lit and you can see
	// the desert - and the horde - from up here.
	AddBox(FVector(-250.f, 4250.f, 620.f), FVector(150.f, 30.f, 70.f), ConcreteDark, false);
	AddLight(FVector(-200.f, 4400.f, 660.f), FLinearColor(0.85f, 0.90f, 1.f), 3400.f, 900.f);
	AddLight(FVector(0.f, 4800.f, 660.f), FLinearColor(1.f, 0.86f, 0.68f), 3000.f, 900.f);

	// Plinth under the cache, at the far end behind the lock.
	AddBox(FVector(0.f, 4860.f, 400.f), FVector(70.f, 70.f, 20.f), SteelColour);

	// --- the tower above ----------------------------------------------------
	const float ShaftBase = 760.f;
	const float ShaftTop = 2360.f;
	AddBox(FVector(0.f, BaseY, (ShaftBase + ShaftTop) * 0.5f), FVector(430.f, 340.f, (ShaftTop - ShaftBase) * 0.5f), ConcreteColour);

	const float GlazeZ = (ShaftBase + ShaftTop) * 0.5f;
	const float GlazeHeight = (ShaftTop - ShaftBase) * 0.42f;
	AddBox(FVector(433.f, BaseY, GlazeZ),  FVector(3.f, 280.f, GlazeHeight), GlassColour, false);
	AddBox(FVector(-433.f, BaseY, GlazeZ), FVector(3.f, 280.f, GlazeHeight), GlassColour, false);
	AddBox(FVector(0.f, BaseY + 343.f, GlazeZ), FVector(350.f, 3.f, GlazeHeight), GlassColour, false);
	AddBox(FVector(0.f, BaseY - 343.f, GlazeZ), FVector(350.f, 3.f, GlazeHeight), GlassColour, false);

	for (int32 Index = 1; Index <= 4; ++Index)
	{
		const float Z = ShaftBase + (ShaftTop - ShaftBase) * Index / 5.f;
		AddBox(FVector(0.f, BaseY, Z), FVector(450.f, 358.f, 12.f), ConcreteDark, false);
	}

	AddBox(FVector(-70.f, BaseY + 50.f, ShaftTop + 110.f), FVector(320.f, 250.f, 110.f), ConcreteColour);
	AddBox(FVector(60.f, BaseY - 40.f, ShaftTop + 300.f),  FVector(190.f, 150.f, 90.f),  ConcreteColour);
	AddBox(FVector(-30.f, BaseY + 20.f, ShaftTop + 430.f), FVector(90.f, 80.f, 50.f),    ConcreteColour);
}

void ADesertBuilder::BuildExtractionPad()
{
	const FLinearColor Beacon(1.f, 0.66f, 0.16f);

	// A ring of low markers rather than a solid disc, so it does not read as a
	// platform you are meant to stand on top of.
	for (int32 Index = 0; Index < 12; ++Index)
	{
		const float Angle = (360.f / 12.f) * Index;
		const FVector At(
			FMath::Cos(FMath::DegreesToRadians(Angle)) * 300.f,
			FMath::Sin(FMath::DegreesToRadians(Angle)) * 300.f,
			10.f);

		AddRotatedBox(At, FVector(34.f, 12.f, 10.f), FRotator(0.f, Angle + 90.f, 0.f), Beacon, false);
	}

	// Mast, visible over the cover from anywhere in the arena.
	AddPillar(FVector(0.f, 0.f, 300.f), 16.f, 300.f, SteelColour);
	AddPillar(FVector(0.f, 0.f, 610.f), 34.f, 16.f, Beacon, false);
	AddLight(FVector(0.f, 0.f, 640.f), Beacon, 16000.f, 2600.f);
}

void ADesertBuilder::Build()
{
	if (!CubeMesh)
	{
		UE_LOG(LogTemp, Error, TEXT("Vantage: /Engine/BasicShapes/Cube.Cube not found; level will be empty."));
		return;
	}

	if (!CylinderMesh || !SphereMesh || !ConeMesh)
	{
		UE_LOG(LogTemp, Warning,
			TEXT("Vantage: some /Engine/BasicShapes meshes are missing; detail props will be skipped."));
	}

	BuildSky();
	BuildGround();
	AddDunes();
	BuildCity();
	AddDistantSkyline();
	BuildCover();
	BuildVaultRuin();
	BuildExtractionPad();
}
