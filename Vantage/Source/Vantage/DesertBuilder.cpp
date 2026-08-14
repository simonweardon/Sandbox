#include "DesertBuilder.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
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
	const FLinearColor ConcreteColour (0.440f, 0.420f, 0.380f);
	const FLinearColor ConcreteDark   (0.270f, 0.260f, 0.235f);
	const FLinearColor GlassColour    (0.055f, 0.075f, 0.095f);
	const FLinearColor RustColour     (0.330f, 0.170f, 0.095f);
	const FLinearColor SteelColour    (0.230f, 0.235f, 0.250f);
	const FLinearColor DistantColour  (0.330f, 0.300f, 0.300f);
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
		Material->SetVectorParameterValue(TEXT("Color"), Colour);
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
}
