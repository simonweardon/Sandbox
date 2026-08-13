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
	/** The engine cube is 100cm on a side, so half extents divide by 50. */
	constexpr float CubeHalfSize = 50.f;

	const FLinearColor FloorColour   (0.085f, 0.095f, 0.115f);
	const FLinearColor WallColour    (0.170f, 0.180f, 0.210f);
	const FLinearColor CeilingColour (0.065f, 0.070f, 0.085f);
	const FLinearColor TrimColour    (0.020f, 0.330f, 0.430f);
	const FLinearColor PedestalColour(0.130f, 0.140f, 0.170f);
	const FLinearColor CrateColour   (0.210f, 0.160f, 0.105f);

	const FLinearColor LampWarm(1.f, 0.90f, 0.74f);
	const FLinearColor LampCool(0.62f, 0.80f, 1.f);
}

AFacilityBuilder::AFacilityBuilder()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Movable);
	RootComponent = Root;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		CubeMesh = CubeFinder.Object;
	}
}

UStaticMeshComponent* AFacilityBuilder::AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour)
{
	UStaticMeshComponent* Box = NewObject<UStaticMeshComponent>(this);
	Box->SetupAttachment(RootComponent);
	Box->SetStaticMesh(CubeMesh);

	// Mobility has to be set before registration, otherwise moving it afterwards
	// trips the "static component moved" warning.
	Box->SetMobility(EComponentMobility::Movable);
	Box->RegisterComponent();

	Box->SetWorldLocation(Centre);
	Box->SetWorldScale3D(HalfExtent / CubeHalfSize);
	Box->SetCollisionProfileName(TEXT("BlockAll"));

	if (UMaterialInstanceDynamic* Material = Box->CreateAndSetMaterialInstanceDynamic(0))
	{
		Material->SetVectorParameterValue(TEXT("Color"), Colour);
	}

	BuiltComponents.Add(Box);
	return Box;
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

void AFacilityBuilder::Build()
{
	if (!CubeMesh)
	{
		UE_LOG(LogTemp, Error, TEXT("Vantage: /Engine/BasicShapes/Cube.Cube not found; level will be empty."));
		return;
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
	AddBox(FVector(0.f, 0.f, -25.f),  FVector(720.f, 720.f, 25.f), FloorColour);
	AddBox(FVector(0.f, 0.f, 470.f),  FVector(720.f, 720.f, 20.f), CeilingColour);

	AddBox(FVector(-720.f, 0.f, 225.f), FVector(20.f, 720.f, 225.f), WallColour);
	AddBox(FVector(0.f, 720.f, 225.f),  FVector(700.f, 20.f, 225.f), WallColour);
	AddBox(FVector(0.f, -720.f, 225.f), FVector(700.f, 20.f, 225.f), WallColour);

	// East wall, split around the corridor mouth.
	AddBox(FVector(720.f, 450.f, 225.f),  FVector(20.f, 270.f, 225.f), WallColour);
	AddBox(FVector(720.f, -450.f, 225.f), FVector(20.f, 270.f, 225.f), WallColour);
	AddBox(FVector(720.f, 0.f, 375.f),    FVector(20.f, 180.f, 75.f),  WallColour);

	// Lit trim at the base of the walls, so the room reads even with the
	// flashlight off and gives the eye a line to follow toward the exit.
	AddBox(FVector(-700.f, 0.f, 8.f), FVector(6.f, 700.f, 8.f), TrimColour);
	AddBox(FVector(0.f, 700.f, 8.f),  FVector(700.f, 6.f, 8.f), TrimColour);
	AddBox(FVector(0.f, -700.f, 8.f), FVector(700.f, 6.f, 8.f), TrimColour);

	AddLight(FVector(0.f, 0.f, 400.f),      LampWarm, 14000.f, 2200.f);
	AddLight(FVector(-450.f, 450.f, 380.f), LampCool, 5000.f,  1400.f);
	AddLight(FVector(450.f, -450.f, 380.f), LampCool, 5000.f,  1400.f);
}

// A deliberately tight, low run between the two rooms: X 700..1900, Y -180..180,
// ceiling at 300. The squeeze is what makes the vault feel large.
void AFacilityBuilder::BuildCorridor()
{
	AddBox(FVector(1300.f, 0.f, -25.f), FVector(620.f, 200.f, 25.f), FloorColour);
	AddBox(FVector(1300.f, 0.f, 320.f), FVector(620.f, 200.f, 20.f), CeilingColour);

	AddBox(FVector(1300.f, 200.f, 150.f),  FVector(600.f, 20.f, 150.f), WallColour);
	AddBox(FVector(1300.f, -200.f, 150.f), FVector(600.f, 20.f, 150.f), WallColour);

	AddBox(FVector(1300.f, 180.f, 8.f),  FVector(600.f, 6.f, 8.f), TrimColour);
	AddBox(FVector(1300.f, -180.f, 8.f), FVector(600.f, 6.f, 8.f), TrimColour);

	// Ribs, to give the walk down the corridor some rhythm.
	for (int32 Index = 0; Index < 5; ++Index)
	{
		const float X = 820.f + Index * 240.f;
		AddBox(FVector(X, 190.f, 150.f),  FVector(14.f, 12.f, 150.f), CeilingColour);
		AddBox(FVector(X, -190.f, 150.f), FVector(14.f, 12.f, 150.f), CeilingColour);
	}

	AddLight(FVector(940.f, 0.f, 270.f),  LampWarm, 3200.f, 900.f);
	AddLight(FVector(1420.f, 0.f, 270.f), LampWarm, 3200.f, 900.f);
	AddLight(FVector(1820.f, 0.f, 270.f), LampCool, 2600.f, 900.f);
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

	AddBox(FVector(3420.f, 0.f, 275.f),  FVector(20.f, 920.f, 275.f), WallColour);
	AddBox(FVector(2650.f, 920.f, 275.f), FVector(750.f, 20.f, 275.f), WallColour);
	AddBox(FVector(2650.f, -920.f, 275.f), FVector(750.f, 20.f, 275.f), WallColour);

	AddBox(FVector(2650.f, 900.f, 8.f),  FVector(750.f, 6.f, 8.f), TrimColour);
	AddBox(FVector(2650.f, -900.f, 8.f), FVector(750.f, 6.f, 8.f), TrimColour);
	AddBox(FVector(3400.f, 0.f, 8.f),    FVector(6.f, 900.f, 8.f), TrimColour);

	// Two steps up to the terminal dais at the far end.
	AddBox(FVector(3120.f, 0.f, 20.f), FVector(300.f, 420.f, 20.f), PedestalColour);
	AddBox(FVector(3160.f, 0.f, 55.f), FVector(260.f, 360.f, 20.f), PedestalColour);

	AddLight(FVector(2300.f, -420.f, 500.f), LampCool, 7000.f, 1800.f);
	AddLight(FVector(2300.f, 420.f, 500.f),  LampCool, 7000.f, 1800.f);
	AddLight(FVector(3050.f, 0.f, 500.f),    LampWarm, 9000.f, 2000.f);
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
		AddBox(
			Site.Base + FVector(0.f, 0.f, Site.PlinthHeight),
			FVector(Site.PlinthHalf, Site.PlinthHalf, Site.PlinthHeight),
			PedestalColour);

		World->SpawnActor<AShardPickup>(
			Site.Base + FVector(0.f, 0.f, Site.PlinthHeight * 2.f + 55.f),
			FRotator::ZeroRotator,
			SpawnParams);
	}

	// The blast door sits on the vault side of the west wall, so the halves have
	// somewhere to park when they slide apart.
	World->SpawnActor<ASlidingDoor>(FVector(1935.f, 0.f, 0.f), FRotator::ZeroRotator, SpawnParams);

	World->SpawnActor<AVaultTerminal>(FVector(3160.f, 0.f, 75.f), FRotator(0.f, 180.f, 0.f), SpawnParams);

	// Scattered crates. Hand placed rather than randomised so the silhouettes
	// stay readable and nothing ever spawns blocking the corridor.
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

		// Every third crate gets a smaller one stacked on it.
		if (Index % 3 == 0)
		{
			AddBox(
				Crates[Index] + FVector(12.f, -8.f, Half * 2.f + 35.f),
				FVector(35.f, 35.f, 35.f),
				CrateColour);
		}
	}
}
